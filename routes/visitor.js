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
        );

        // 2️⃣ Load all payment visitors with user populated
        const visitors = await paymentVisitor
            .find()
            .populate("user", "name email phone country company createdAt")
            .sort({ createdAt: -1 });

        const normalize = (str) => str?.toLowerCase().trim() || "";

        // Utility: compare only the date (YYYY-MM-DD)
        const isSameDate = (date1, date2) => {
            const d1 = new Date(date1);
            const d2 = new Date(date2);
            return (
                d1.getFullYear() === d2.getFullYear() &&
                d1.getMonth() === d2.getMonth() &&
                d1.getDate() === d2.getDate()
            );
        };

        // 3️⃣ Comparison logic
        const abandonedVisitors = visitors.filter((visitor) => {
            const companyDetails = {
                name: normalize(visitor.companyName),
                address: normalize(visitor.address),
                city: normalize(visitor.city),
                state: normalize(visitor.state),
                country: normalize(visitor.country),
                postalCode: normalize(visitor.postalCode),
                phone: normalize(visitor.telephone),
                website: normalize(visitor.website),
            };

            const contactDetails = {
                name: normalize(visitor.contactName),
                email: normalize(visitor.contactEmail),
                phone: normalize(visitor.contactPhone),
                optionalEmail: normalize(visitor.optionalEmail),
                company: normalize(visitor.contactCompany),
                website: normalize(visitor.website),
                country: normalize(visitor.contactCountry),
            };

            let matchedRequest = null;

            const isMatched = reportRequests.some((req) => {
                const target = {
                    name: normalize(req.targetCompany?.name),
                    address: normalize(req.targetCompany?.address),
                    city: normalize(req.targetCompany?.city),
                    state: normalize(req.targetCompany?.state),
                    country: normalize(req.targetCompany?.country),
                    postalCode: normalize(req.targetCompany?.postalCode),
                    phone: normalize(req.targetCompany?.phone),
                    website: normalize(req.targetCompany?.website),
                };

                const requester = {
                    name: normalize(req.requesterInfo?.name),
                    email: normalize(req.requesterInfo?.email),
                    phone: normalize(req.requesterInfo?.phone),
                    optionalEmail: normalize(req.requesterInfo?.optionalEmail),
                    company: normalize(req.requesterInfo?.company),
                    website: normalize(req.requesterInfo?.website),
                    country: normalize(req.requesterInfo?.country),
                };

                // 🔍 Match both company and requester
                const companyMatch =
                    companyDetails.name === target.name &&
                    companyDetails.address === target.address &&
                    companyDetails.country === target.country;

                const requesterMatch =
                    (contactDetails.email === requester.email ||
                        contactDetails.phone === requester.phone ||
                        contactDetails.company === requester.company) &&
                    contactDetails.country === requester.country;

                // 🗓️ Match only if both created on same date
                const dateMatch = isSameDate(req.createdAt, visitor.createdAt);

                if (companyMatch && requesterMatch
                    && dateMatch
                ) {
                    matchedRequest = {
                        visitorCompany: companyDetails.name,
                        visitorEmail: contactDetails.email,
                        matchedCompany: target.name,
                        matchedRequesterEmail: requester.email,
                        requestDate: req.createdAt,
                        visitorDate: visitor.createdAt,
                    };
                    return true;
                }

                return false;
            });

            // Debug logs
            // if (isMatched) {
            //     console.log("✅ SAME-DATE MATCH FOUND:", {
            //         company: companyDetails.name,
            //         email: contactDetails.email,
            //         visitorDate: visitor.createdAt,
            //     });
            // } else {
            //     console.log("❌ NO SAME-DATE MATCH:", {
            //         company: companyDetails.name,
            //         email: contactDetails.email,
            //         visitorDate: visitor.createdAt,
            //     });
            // }

            return !isMatched; // keep only non-matching (abandoned) visitors
        });

        // 4️⃣ Response
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


// visitorsRouter.get("/abandoned-checkouts", async (req, res) => {
//     try {
//         // 1️⃣ Load all report requests
//         const reportRequests = await ReportRequest.find(
//             {},
//             "targetCompany requesterInfo createdAt"
//         );

//         // 2️⃣ Load all payment visitors with user populated
//         const visitors = await paymentVisitor
//             .find()
//             .populate("user", "name email phone country company createdAt")
//             .sort({ createdAt: -1 });

//         const normalize = (str) => str?.toLowerCase().trim() || "";

//         // 3️⃣ Comparison logic
//         const abandonedVisitors = visitors.filter((visitor) => {
//             const companyDetails = {
//                 name: normalize(visitor.companyName),
//                 address: normalize(visitor.address),
//                 city: normalize(visitor.city),
//                 state: normalize(visitor.state),
//                 country: normalize(visitor.country),
//                 postalCode: normalize(visitor.postalCode),
//                 phone: normalize(visitor.telephone),
//                 website: normalize(visitor.website),
//             };

//             const contactDetails = {
//                 name: normalize(visitor.contactName),
//                 email: normalize(visitor.contactEmail),
//                 phone: normalize(visitor.contactPhone),
//                 optionalEmail: normalize(visitor.optionalEmail),
//                 company: normalize(visitor.contactCompany),
//                 website: normalize(visitor.website),
//                 country: normalize(visitor.contactCountry),
//             };

//             let matchedRequest = null;

//             const isMatched = reportRequests.some((req) => {
//                 const target = {
//                     name: normalize(req.targetCompany?.name),
//                     address: normalize(req.targetCompany?.address),
//                     city: normalize(req.targetCompany?.city),
//                     state: normalize(req.targetCompany?.state),
//                     country: normalize(req.targetCompany?.country),
//                     postalCode: normalize(req.targetCompany?.postalCode),
//                     phone: normalize(req.targetCompany?.phone),
//                     website: normalize(req.targetCompany?.website),
//                 };

//                 const requester = {
//                     name: normalize(req.requesterInfo?.name),
//                     email: normalize(req.requesterInfo?.email),
//                     phone: normalize(req.requesterInfo?.phone),
//                     optionalEmail: normalize(req.requesterInfo?.optionalEmail),
//                     company: normalize(req.requesterInfo?.company),
//                     website: normalize(req.requesterInfo?.website),
//                     country: normalize(req.requesterInfo?.country),
//                 };

//                 // 🔍 Match both company and requester sections
//                 const companyMatch =
//                     companyDetails.name === target.name &&
//                     companyDetails.address === target.address &&
//                     companyDetails.country === target.country;

//                 const requesterMatch =
//                     (contactDetails.email === requester.email ||
//                         contactDetails.phone === requester.phone ||
//                         contactDetails.company === requester.company) &&
//                     contactDetails.country === requester.country;

//                 if (companyMatch && requesterMatch) {
//                     matchedRequest = {
//                         visitorCompany: companyDetails.name,
//                         visitorEmail: contactDetails.email,
//                         matchedCompany: target.name,
//                         matchedRequesterEmail: requester.email,
//                     };
//                     return true;
//                 }

//                 return false;
//             });

//             // 🪵 Debug logs
//             if (isMatched) {
//                 console.log("✅ MATCH FOUND:");
//                 console.log("Visitor:", {
//                     company: companyDetails.name,
//                     email: contactDetails.email,
//                     phone: contactDetails.phone,
//                     address: companyDetails.address,
//                     country: companyDetails.country,
//                 });
//                 console.log("Matched With:", matchedRequest);
//                 console.log("----------------------------------------------------");
//             } else {
//                 console.log("❌ NO MATCH:");
//                 console.log("Visitor:", {
//                     company: companyDetails.name,
//                     email: contactDetails.email,
//                     phone: contactDetails.phone,
//                     address: companyDetails.address,
//                     country: companyDetails.country,
//                 });
//                 console.log("----------------------------------------------------");
//             }

//             return !isMatched;
//         });

//         // 4️⃣ Response
//         res.status(200).json({
//             success: true,
//             count: abandonedVisitors.length,
//             visitors: abandonedVisitors,
//         });
//     } catch (error) {
//         console.error("🚨 Abandoned checkout detection error:", error);
//         res.status(500).json({
//             success: false,
//             message: "Internal server error",
//         });
//     }
// });








export default visitorsRouter;
