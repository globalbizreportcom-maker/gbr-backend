import mongoose from "mongoose";

const ReportRequestSchema = new mongoose.Schema({
    companyType: { type: String, required: false, },
    targetCompany: {
        name: { type: String, required: true },
        address: String,
        country: String,
        state: String,
        city: String,
        postalCode: String,
        phone: String,
        website: String,
    },
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    requesterInfo: {
        name: { type: String, required: true },
        email: { type: String, required: true },
        phone: { type: String, required: true },
        optionalEmail: String,
        company: String,
        website: String,
        country: String,
        gst: String,
    },
    agreementAccepted: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ["initiated", "in-progress", "completed", "delivered"],
        default: "initiated",
    },
}, { timestamps: true });

// export default mongoose.model("ReportRequest", ReportRequestSchema);
export default mongoose.model("ReportRequest", ReportRequestSchema, "reportrequests");
