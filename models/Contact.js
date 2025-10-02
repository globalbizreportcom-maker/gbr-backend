// import mongoose from "mongoose";

// const ContactSchema = new mongoose.Schema({
//     fullName: { type: String, required: true, trim: true },
//     email: { type: String, required: true, lowercase: true },
//     subject: { type: String },
//     message: { type: String, required: true },
// }, { timestamps: true });

// export default mongoose.models.Contact || mongoose.model("Contact", ContactSchema);


import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
    sender: { type: String, enum: ["user", "admin"], required: true },
    message: { type: String, required: true },
    subject: { type: String },          // <-- subject per message
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
});

const ContactSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true },
        messages: [MessageSchema],       // <-- array of messages with subject
    },
    { timestamps: true }
);

export default mongoose.models.Contact || mongoose.model("Contact", ContactSchema);
