import mongoose from "mongoose";

const ContactSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true },
    subject: { type: String },
    message: { type: String, required: true },
}, { timestamps: true });

export default mongoose.models.Contact || mongoose.model("Contact", ContactSchema);
