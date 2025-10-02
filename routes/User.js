import express from "express";
import { verifyUser } from "./middleware/VerifyUser.js";
import { addPassword, changePassword, updateProfile } from "../controllers/userController.js";
import ReportRequest from "../models/ReportRequest.js";
import Payment from "../models/Payment.js";
import mongoose from "mongoose";
import ReportFile from "../models/ReportFile.js";


const userRouter = express.Router();

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

        const totalOrders = results.length;
        const receivedReports = results.filter(r => r.reportRequest.status === "delivered").length;
        const trackOrders = results.filter(r => r.reportRequest.status !== "delivered").length;

        res.json({
            totalOrders,
            receivedReports,
            trackOrders,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
});

// GET /user/payments
userRouter.get("/payments", verifyUser, async (req, res) => {
    const { userId } = req.query; // userId from frontend query

    if (!userId) return res.status(400).json({ error: "userId is required" });

    try {
        const payments = await Payment.find({
            user: userId,
            status: { $ne: 'created' }
        })
            .populate({
                path: "reportRequest",
                select: "targetCompany status requesterInfo createdAt",
            })
            .sort({ createdAt: -1 });

        res.json(payments);
    } catch (err) {
        console.error("Error fetching payments:", err);
        res.status(500).json({ error: "Failed to fetch payments" });
    }
});

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
