import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            required: [false, "Phone number is required"],
            unique: false,
            trim: true,
        },
        country: {
            type: String,
            required: [true, "Country is required"],
        },
        password: {
            type: String,
            required: [false, "Password is required"],
        },
        company: {
            type: String,
            required: [false, "Company is required"],
        }
    },
    { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;
