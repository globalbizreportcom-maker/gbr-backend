import express from 'express';
import dotenv from 'dotenv';
import Contact from '../models/Contact.js';
import paymentVisitor from '../models/paymentVisitor.js';
import Payment from '../models/Payment.js';
import ReportRequest from '../models/ReportRequest.js';
dotenv.config();

const visitorsRouter = express.Router();

// POST /api/visitors
visitorsRouter.post("/payments", async (req, res) => {
    try {
        const { userId, ...formData } = req.body;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }

        const visitor = new paymentVisitor({ ...formData, user: userId });
        await visitor.save();

        res.status(201).json({ message: "Visitor saved successfully", visitor });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// routes/visitor.js
visitorsRouter.get("/payments", async (req, res) => {
    try {
        const visitors = await paymentVisitor.find()
            .populate({
                path: "user",
                select: "name email phone country company createdAt", // Select only needed fields
            })
            .sort({ createdAt: -1 }); // Sort newest first
        res.status(200).json({ visitors });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

// 🧾 GET abandoned checkouts (visitors who haven't placed a report request)
visitorsRouter.get("/abandoned-checkouts", async (req, res) => {
    try {
        // 1️⃣ Get all report requests (only company + address)
        const reportRequests = await ReportRequest.find(
            {},
            "targetCompany.name targetCompany.address"
        );

        // 2️⃣ Get all payment visitors with user populated
        const visitors = await paymentVisitor
            .find()
            .populate("user", "name email phone country company createdAt")
            .sort({ createdAt: -1 });

        // 3️⃣ Filter visitors not found in report requests
        const abandonedVisitors = visitors.filter((visitor) => {
            const vName = visitor.companyName?.toLowerCase().trim();
            const vAddress = visitor.address?.toLowerCase().trim();

            // find match in report requests
            const isMatched = reportRequests.some((req) => {
                const rName = req.targetCompany?.name?.toLowerCase().trim();
                const rAddress = req.targetCompany?.address?.toLowerCase().trim();

                // ✅ Match both name & address exactly (case-insensitive)
                return vName === rName && vAddress === rAddress;
            });

            return !isMatched; // keep those not found
        });

        // 4️⃣ Return all unmatched visitors with full data
        res.status(200).json({
            success: true,
            count: abandonedVisitors.length,
            visitors: abandonedVisitors,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});




export default visitorsRouter;
