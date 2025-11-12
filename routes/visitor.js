import express from 'express';
import dotenv from 'dotenv';
import Contact from '../models/Contact.js';
import paymentVisitor from '../models/paymentVisitor.js';
import Payment from '../models/Payment.js';
import ReportRequest from '../models/ReportRequest.js';
import { agenda } from '../agenda.js';
dotenv.config();

const visitorsRouter = express.Router();

// POST /api/visitors
visitorsRouter.post("/payments", async (req, res) => {
    try {
        const { userId, ...formData } = req.body;
        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }

        const visitor = new paymentVisitor({
            ...formData, user: userId,
            paymentAmount: formData.paymentAmount,
            currency: formData.currency,
            contactCountry: formData.contactCountry?.label || formData.contactCountry
        });
        await visitor.save();

        // 🕒 Schedule abandoned checkout reminder with full visitor data
        await agenda.schedule("in 25 minutes", "send abandoned checkout email", {
            userId,
            visitorData: visitor.toObject(), // send full saved visitor document
        });

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
// visitorsRouter.get("/abandoned-checkouts", async (req, res) => {
//     try {
//         // 1️⃣ Get all report requests (only company + address)
//         const reportRequests = await ReportRequest.find(
//             {},
//             "targetCompany.name targetCompany.address"
//         );

//         // 2️⃣ Get all payment visitors with user populated
//         const visitors = await paymentVisitor
//             .find()
//             .populate("user", "name email phone country company createdAt")
//             .sort({ createdAt: -1 });

//         // 3️⃣ Filter visitors not found in report requests
//         const abandonedVisitors = visitors.filter((visitor) => {
//             const vName = visitor.companyName?.toLowerCase().trim();
//             const vAddress = visitor.address?.toLowerCase().trim();

//             // find match in report requests
//             const isMatched = reportRequests.some((req) => {
//                 const rName = req.targetCompany?.name?.toLowerCase().trim();
//                 const rAddress = req.targetCompany?.address?.toLowerCase().trim();

//                 // ✅ Match both name & address exactly (case-insensitive)
//                 return vName === rName && vAddress === rAddress;
//             });

//             return !isMatched; // keep those not found
//         });

//         // 4️⃣ Return all unmatched visitors with full data
//         res.status(200).json({
//             success: true,
//             count: abandonedVisitors.length,
//             visitors: abandonedVisitors,
//         });
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: "Internal server error",
//         });
//     }
// });

visitorsRouter.get("/abandoned-checkouts", async (req, res) => {
    try {

        // 1️⃣ Load all report requests
        const reportRequests = await ReportRequest.find(
            {},
            "targetCompany requesterInfo createdAt"
        ).lean(); // ⚡ faster plain JS objects

        // 2️⃣ Load all payment visitors
        const visitors = await paymentVisitor
            .find()
            .populate("user", "name email phone country company createdAt")
            .sort({ createdAt: -1 })
            .lean();

        // Normalize helper
        const normalize = (str) =>
            typeof str === "string" ? str.toLowerCase().trim() : "";

        // Extract only date (YYYY-MM-DD)
        const dateKey = (date) => {
            if (!date) return "";
            const d = new Date(date);
            return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        };

        // 3️⃣ Build a lookup map for fast matching
        const reportMap = new Map();

        for (const req of reportRequests) {
            const key = [
                normalize(req.targetCompany?.name),
                normalize(req.targetCompany?.address),
                normalize(req.requesterInfo?.country),
                normalize(req.requesterInfo?.email),
                normalize(req.requesterInfo?.phone),
                normalize(req.requesterInfo?.company),
                dateKey(req.createdAt),
            ].join("|");
            reportMap.set(key, true);
        }


        // 4️⃣ Compare each visitor against the map
        const abandonedVisitors = [];
        for (const visitor of visitors) {
            const key = [
                normalize(visitor.companyName),
                normalize(visitor.address),
                normalize(visitor.contactCountry),
                normalize(visitor.contactEmail),
                normalize(visitor.contactPhone),
                normalize(visitor.contactCompany),
                dateKey(visitor.createdAt),
            ].join("|");

            if (!reportMap.has(key)) {
                abandonedVisitors.push(visitor);
            }
        }

        // 5️⃣ Send Response
        res.status(200).json({
            success: true,
            count: abandonedVisitors.length,
            visitors: abandonedVisitors,
        });
    } catch (error) {
        console.error("🚨 Abandoned checkout detection error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});







export default visitorsRouter;
