import mongoose from "mongoose";

const ReportFileSchema = new mongoose.Schema({
    reportRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ReportRequest" },
    fileUrl: String, // S3 / CloudFront
    uploadedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model("ReportFile", ReportFileSchema);
