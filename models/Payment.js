import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
    {
        reportRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ReportRequest" },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: { type: String, enum: ["created", "pending", "paid", "failed"], default: "pending" },
        orderId: { type: String, required: true },       // Razorpay / PayPal order ID
        paymentId: { type: String },                     // Razorpay / PayPal payment ID
        amount: { type: Number, required: true },
        currency: { type: String, default: "INR" },
        paidAt: { type: Date },

        method: {
            type: String,
            enum: ["razorpay", "paypal", "card", "upi", "bank", "cheque", "other"],
            required: false,
        },

        details: {
            // General
            payerEmail: { type: String },
            payerName: { type: String },
            payerContact: { type: String },

            // Card info
            cardLast4: { type: String },
            cardType: { type: String },

            // UPI info
            upiId: { type: String },
            upiTransactionId: { type: String },
            rrn: { type: String },

            // Bank info
            bankName: { type: String },
            accountNumber: { type: String },
            ifsc: { type: String },

            // Cheque info
            chequeNumber: { type: String },

            // Acquirer / gateway data
            acquirerData: { type: mongoose.Schema.Types.Mixed },

            // Additional optional fields
            description: { type: String },
            fee: { type: Number },
            tax: { type: Number },
            notes: { type: Array },

            // PayPal-specific
            captureId: { type: String },

            // Razorpay-specific
            receipt: { type: String },
            card_id: { type: String },
            international: { type: Boolean },
            wallet: { type: String },
        },
    },
    { timestamps: true }
);

export default mongoose.model("Payment", PaymentSchema);
