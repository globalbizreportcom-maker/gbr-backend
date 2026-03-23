import express from "express";
import { verifyUser } from "./middleware/VerifyUser.js";
import { addPassword, changePassword, updateProfile } from "../controllers/userController.js";
import ReportRequest from "../models/ReportRequest.js";
import Payment from "../models/Payment.js";
import mongoose from "mongoose";
import ReportFile from "../models/ReportFile.js";
import ClaimCompanyPayment from "../models/ClaimCompanyPayment.js";
import CompanyEdit from "../models/CompanyEdit.js";
import cloudinary from "../config/cloudinary.js";
import upload from "../lib/multer.js";


const userRouter = express.Router();

export const uploadToCloudinary = (buffer, folder) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder },
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url);
            }
        ).end(buffer);
    });
};

// POST /register
userRouter.get("/protected", verifyUser, (req, res) => {
    res.json({ success: true, user: req.user });
});

userRouter.post("/add-password", verifyUser, addPassword);
userRouter.post("/change-password", verifyUser, changePassword);
userRouter.post("/update-profile", verifyUser, updateProfile);

userRouter.get("/delivered-reports", verifyUser, async (req, res) => {
    const { userId } = req.query; // <-- use query, not params

    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    try {
        const reports = await ReportRequest.find({
            requester: userId,
            status: "delivered" // only delivered reports
        }).sort({ createdAt: -1 });

        res.json(reports);
    } catch (err) {
        console.error("Error fetching reports:", err);
        res.status(500).json({ error: "Failed to fetch reports" });
    }
});

userRouter.get("/orders-tracking", verifyUser, async (req, res) => {
    const { userId } = req.query; // use query
    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    try {
        const reports = await Payment.aggregate([
            { $match: { status: "paid" } }, // only paid payments
            {
                $lookup: {
                    from: "reportrequests",           // collection to join
                    localField: "reportRequest",     // field in Payment
                    foreignField: "_id",             // field in ReportRequest
                    as: "reportRequest",
                },
            },
            { $unwind: "$reportRequest" },       // flatten the array
            {
                $match: {
                    "reportRequest.requester": new mongoose.Types.ObjectId(userId),
                    "reportRequest.status": { $ne: "delivered" } // not delivered
                }
            },
            { $replaceRoot: { newRoot: "$reportRequest" } }, // return only the report object
            { $sort: { createdAt: -1 } }        // sort by latest
        ]);

        res.json(reports);
    } catch (err) {
        console.error("Error fetching reports:", err);
        res.status(500).json({ error: "Failed to fetch reports" });
    }
});

userRouter.get("/total/orders", verifyUser, async (req, res) => {
    const { userId } = req.query; // use query

    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    try {
        const reports = await Payment.aggregate([
            { $match: { status: "paid" } }, // only paid payments
            {
                $lookup: {
                    from: "reportrequests",           // collection to join
                    localField: "reportRequest",     // field in Payment
                    foreignField: "_id",             // field in ReportRequest
                    as: "reportRequest",
                },
            },
            { $unwind: "$reportRequest" },       // flatten the array
            {
                $match: {
                    "reportRequest.requester": new mongoose.Types.ObjectId(userId),
                    // "reportRequest.status": { $ne: "delivered" } // not delivered
                }
            },
            { $replaceRoot: { newRoot: "$reportRequest" } }, // return only the report object
            { $sort: { createdAt: -1 } }        // sort by latest
        ]);

        res.json(reports);
    } catch (err) {
        console.error("Error fetching reports:", err);
        res.status(500).json({ error: "Failed to fetch reports" });
    }
});

userRouter.get("/track/get-report/:id", verifyUser, async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ error: "Report ID is required" });
    }

    try {
        const report = await ReportRequest.findById(id).populate("requester", "name email");
        if (!report) {
            return res.status(404).json({ error: "Report not found" });
        }
        res.json(report);
    } catch (err) {
        console.error("Error fetching report:", err);
        res.status(500).json({ error: "Failed to fetch report" });
    }
});

userRouter.get("/get-report/:id", verifyUser, async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id; // assuming you have auth middleware
    if (!id) {
        return res.status(400).json({ error: "Report ID is required" });
    }

    try {
        // Fetch the report request for this user
        const report = await ReportRequest.findOne({
            _id: id,
            requester: userId,
            status: "delivered",
        });

        if (!report) {
            return res.status(404).json({ error: "Report not found" });
        }

        // Fetch all files associated with this report
        const files = await ReportFile.find({ reportRequest: report._id });

        // Return combined data
        res.json({
            report,
            files, // array of report files with URLs
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch report" });
    }
});

// GET /dashboard/stats/:userId
userRouter.get("/dashboard/stats/:userId", verifyUser, async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }

    try {
        const results = await Payment.aggregate([
            { $match: { status: "paid" } }, // only paid payments
            {
                $lookup: {
                    from: "reportrequests", // collection name (lowercased + plural)
                    localField: "reportRequest",
                    foreignField: "_id",
                    as: "reportRequest",
                },
            },
            { $unwind: "$reportRequest" },
            { $match: { "reportRequest.requester": new mongoose.Types.ObjectId(userId) } },
        ]);

        // --- ClaimCompanyPayment stats for this user ---
        const claimPayments = await ClaimCompanyPayment.find({
            userId: new mongoose.Types.ObjectId(userId),
            paymentStatus: "paid",
        });
        const totalClaimPayments = claimPayments.length;

        const totalOrders = results.length;
        const receivedReports = results.filter(r => r.reportRequest.status === "delivered").length;
        const trackOrders = results.filter(r => r.reportRequest.status !== "delivered").length;

        res.json({
            totalOrders,
            receivedReports,
            trackOrders,
            totalClaimPayments
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
});

// GET /user/payments
userRouter.get("/payments", verifyUser, async (req, res) => {
    const { userId } = req.query; // userId from frontend query

    if (!userId) return res.status(400).json({ error: "userId is required" });

    try {
        // 1️⃣ Report payments
        const reportPayments = await Payment.find({
            user: userId,
            status: { $ne: 'created' },
        })
            .populate({
                path: "reportRequest",
                select: "targetCompany status requesterInfo createdAt",
            })
            .sort({ createdAt: -1 });

        // 2️⃣ Claim company payments
        const claimPayments = await ClaimCompanyPayment.find({
            userId: userId,
        })
            .sort({ createdAt: -1 });

        // 3️⃣ Send combined response
        res.json({
            reportPayments,
            claimPayments,
        });

    } catch (err) {
        console.error("Error fetching payments:", err);
        res.status(500).json({ error: "Failed to fetch payments" });
    }
});

// GET /claimed-payments/:userId
userRouter.get("/claimed-payments/:userId", verifyUser, async (req, res) => {
    const { userId } = req.params;

    try {
        // Find payments for this user where paymentStatus is "paid"
        const payments = await ClaimCompanyPayment.find({
            userId,
            paymentStatus: "paid",
        }).populate("company");

        // Optional: sort by creation date descending
        payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(payments);
    } catch (err) {
        console.error("Error fetching user payments:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// POST /user/company-verify
userRouter.post("/company-verify", verifyUser, async (req, res) => {
    try {
        const { companyId, userId } = req.body;

        if (!companyId || !userId) {
            return res.status(400).json({ message: "CIN and userId are required." });
        }

        // Find company payment for this user
        const companyPayment = await ClaimCompanyPayment.findOne({
            "company.cin": companyId,
            userId,
            claimStatus: 'approved',
            paymentStatus: "paid",
        });

        if (!companyPayment) {
            return res.status(403).json({ message: "Unauthorized or company not found." });
        }

        // Check payment & claim status
        if (companyPayment.paymentStatus !== "paid" || companyPayment.claimStatus !== "approved") {
            return res.status(403).json({ message: "Payment not done or claim not approved." });
        }

        // Return the company payment data
        return res.status(200).json(companyPayment);
    } catch (err) {
        console.error("Error verifying company:", err);
        return res.status(500).json({ message: "Server error." });
    }
});

// GET /claimed-payments/:userId
userRouter.get("/company-edit", verifyUser, async (req, res) => {
    try {
        const { companyId, userId } = req.query;

        if (!companyId) {
            return res.status(400).json({ error: "Company ID required" });
        }

        let companyEdit = await CompanyEdit.findOne({ companyId, userId });

        return res.status(200).json(companyEdit);

    } catch (error) {
        return res.status(500).json({ error: "Server error" });
    }
});

userRouter.patch("/update/company-details/:companyId", verifyUser, async (req, res) => {
    try {
        const { companyId } = req.params;
        const updates = req.body;

        // 🔐 Get userId from auth middleware (IMPORTANT)
        const userId = req.user?._id; // assuming you have auth

        console.log(updates);

        if (!companyId) {
            return res.status(400).json({ message: "CompanyId is required" });
        }

        const updateFields = {};

        // 🔥 Dynamic mapping
        if (updates.about !== undefined) {
            updateFields["about.content"] = updates.about;
        }

        if (updates.header !== undefined) {
            updateFields["header"] = updates.header;
        }

        if (updates.stats !== undefined) {
            updateFields["stats"] = updates.stats;
        }

        if (updates.services !== undefined) {
            updateFields["services"] = updates.services;
        }

        if (updates.contact !== undefined) {
            updateFields["contact"] = updates.contact;
        }

        //  Prevent empty updates
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        const updatedDoc = await CompanyEdit.findOneAndUpdate(
            { companyId, userId }, // 🔐 secure ownership
            { $set: updateFields },
            {
                new: true,
                runValidators: true, // 🔥 enforce schema
                upsert: true
            }
        );

        res.json({
            success: true,
            message: "Company details updated successfully",
            data: updatedDoc,
        });

    } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({
            success: false,
            message: err.message,
        });
    }
});


userRouter.patch("/update/header/company-details/:cin", upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
]),
    async (req, res) => {
        try {
            const { cin } = req.params;
            const { tagline = "", location = "" } = req.body;

            const updateData = {
                "header.tagline": tagline,
                "header.location": location,
            };

            // 🔥 Upload Logo
            if (req.files?.logo?.length) {
                const logoBuffer = req.files.logo[0].buffer;

                const logoUrl = await uploadToCloudinary(
                    logoBuffer,
                    `company/${cin}/logo`
                );

                updateData["header.logo"] = logoUrl;
            }

            // 🔥 Upload Banner
            if (req.files?.banner?.length) {
                const bannerBuffer = req.files.banner[0].buffer;

                const bannerUrl = await uploadToCloudinary(
                    bannerBuffer,
                    `company/${cin}/banner`
                );

                updateData["header.banner"] = bannerUrl;
            }

            const updatedCompany = await CompanyEdit.findOneAndUpdate(
                { companyId: cin },
                { $set: updateData },
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                }
            );

            return res.status(200).json({
                success: true,
                data: updatedCompany,
            });

        } catch (error) {
            console.error("Header Update Error:", error);

            return res.status(500).json({
                success: false,
                message: "Update failed",
            });
        }
    }
);



// Logout API
userRouter.post("/logout", verifyUser, (req, res) => {
    try {
        res.clearCookie("gbr_user", { httpOnly: true, secure: true, sameSite: "lax" });
        return res.status(200).json({ message: "Logged out successfully" });
    } catch (err) {
        return res.status(500).json({ message: "Logout failed" });
    }
});

export default userRouter;
