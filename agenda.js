

import Agenda from "agenda";
import ReportRequest from "./models/ReportRequest.js";
import { sendAbandonedCheckoutEmail } from "./utils/sendAbandonedCheckoutEmail.js";

const mongoConnectionString = process.env.MONGO_URI;

export const agenda = new Agenda({
    db: { address: mongoConnectionString, collection: "jobs" },
});

agenda.define("send abandoned checkout email", async (job) => {
    const { userId, visitorData } = job.attrs.data;

    // console.log(`⏰ Checking abandoned checkout for user ${userId}`);

    try {
        if (!visitorData) {
            console.log("⚠️ No visitor data provided in job.");
            return;
        }

        // 1️⃣ Load all ReportRequests
        const reportRequests = await ReportRequest.find(
            {},
            "targetCompany requesterInfo"
        );

        const normalize = (str) => str?.toLowerCase().trim() || "";

        // 2️⃣ Extract visitor info
        const companyDetails = {
            name: normalize(visitorData.companyName),
            address: normalize(visitorData.address),
            city: normalize(visitorData.city),
            state: normalize(visitorData.state),
            country: normalize(visitorData.country),
            postalCode: normalize(visitorData.postalCode),
            phone: normalize(visitorData.telephone),
            website: normalize(visitorData.website),
        };

        const contactDetails = {
            name: normalize(visitorData.contactName),
            email: normalize(visitorData.contactEmail),
            phone: normalize(visitorData.contactPhone),
            optionalEmail: normalize(visitorData.optionalEmail),
            company: normalize(visitorData.contactCompany),
            website: normalize(visitorData.website),
            country: normalize(visitorData.contactCountry),
            state: normalize(visitorData.contactState),
            gst: normalize(visitorData.companyGst),
        };

        // 3️⃣ Compare with ReportRequests
        const isAlreadyRequested = reportRequests.some((req) => {
            const target = {
                name: normalize(req.targetCompany?.name),
                address: normalize(req.targetCompany?.address),
                country: normalize(req.targetCompany?.country),
            };

            const requester = {
                email: normalize(req.requesterInfo?.email),
                phone: normalize(req.requesterInfo?.phone),
                company: normalize(req.requesterInfo?.company),
                country: normalize(req.requesterInfo?.country),
            };

            const companyMatch =
                companyDetails.name === target.name &&
                companyDetails.address === target.address &&
                companyDetails.country === target.country;

            const requesterMatch =
                (contactDetails.email === requester.email ||
                    contactDetails.phone === requester.phone ||
                    contactDetails.company === requester.company) &&
                contactDetails.country === requester.country;

            return companyMatch && requesterMatch;
        });

        // 4️⃣ If not matched → send draft order email
        if (!isAlreadyRequested) {
            await sendAbandonedCheckoutEmail(userId, visitorData);
        } else {
            console.log("🟢 Matching report request found, skipping email.");
        }
    } catch (error) {
        console.log("🚨 Abandoned checkout job error:", error);
    }
});

await agenda.start();
