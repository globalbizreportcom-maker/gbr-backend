import mongoose from "mongoose";

const claimCompanyPaymentSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        company: {
            name: {
                type: String,
                required: true
            },
            cin: {
                type: String,
                required: true
            },
            address: {
                type: String,
                required: true
            }
        },

        amount: {
            type: Number,
            required: true
        },

        currency: {
            type: String,
            default: "INR"
        },

        razorpayOrderId: {
            type: String,
            unique: true
        },

        razorpayPaymentId: {
            type: String,
            // unique: true,
            sparse: true,
        },

        razorpaySignature: {
            type: String
        },

        claimStatus: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending"
        },

        paymentStatus: {
            type: String,
            enum: ["created", "paid", "failed", "cancelled"],
            default: "created"
        }

    },
    { timestamps: true }
);


// claimCompanyPaymentSchema.index({ razorpayOrderId: 1 });
// claimCompanyPaymentSchema.index({ "company.cin": 1 });

const ClaimCompanyPayment = mongoose.model(
    "ClaimCompanyPayment",
    claimCompanyPaymentSchema
);

export default ClaimCompanyPayment;