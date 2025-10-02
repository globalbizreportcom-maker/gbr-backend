import express from "express";
import dotenv from "dotenv";
import transporter from "../utils/Nodemailer.js";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import jwt from "jsonwebtoken";

dotenv.config();
const loginRouter = express.Router();

// Temporary in-memory storage (⚠️ use DB/Redis in production)
const otpStore = new Map();

// 📩 Send OTP
loginRouter.post("/send-otp", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email required" });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save OTP (with expiry 5 minutes)
        otpStore.set(email, { otp, expires: Date.now() + 5 * 60 * 1000 });
        console.log(otp);
        // Send email
        await transporter.sendMail({
            from: "Global Biz Report<no-reply@globalbizreport.com>",
            to: email,
            subject: "Your OTP Code",
            html: `<p>Your OTP code is <b>${otp}</b>. It is valid for 5 minutes.</p>`,
        });

        res.json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
        console.error("❌ OTP Send Error:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP" });
    }
});

// ✅ Verify OTP

loginRouter.post("/verify-otp", async (req, res) => {
    const { email, otp } = req.body;
    const record = otpStore.get(email);

    if (!record) {
        return res.status(400).json({ success: false, message: "OTP not found" });
    }
    if (record.expires < Date.now()) {
        return res.status(400).json({ success: false, message: "OTP expired" });
    }
    if (record.otp !== otp) {
        return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    // ✅ OTP success → clear store
    otpStore.delete(email);

    try {
        // 🔍 Fetch user from DB including password temporarily
        const user = await User.findOne({ email }).select("+password"); // include password
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        // 🔑 Check if password exists
        const passwordSet = !!user.password;

        // Convert user to plain object and add passwordSet property
        const userData = user.toObject();
        // Remove actual password before sending
        delete userData.password;

        userData.password = passwordSet;


        // 🔑 Create JWT with user data
        const token = jwt.sign(
            { id: user._id, email: user.email || "user" },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        // 🍪 Set cookie
        res.cookie("gbr_user", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });

        return res.json({
            success: true,
            message: "OTP verified, login success",
            user: userData, // now includes passwordSet property
        });

    } catch (err) {
        console.log("Verify OTP error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

loginRouter.post("/form-submit", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

        // Generate JWT (access token)
        const token = jwt.sign(
            { id: user._id, email: user.email },
            process.env.JWT_SECRET || "your_secret_key",
            { expiresIn: "30d" }
        );

        // Optionally, save token in cookie
        res.cookie("gbr_user", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "Lax",
            maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });

        // Return user info and token
        res.json({
            message: "Login successful",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                company: user.company,
                country: user.country,
            },
            token,
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});



export default loginRouter;
