import jwt from "jsonwebtoken";
import Admin from "../../models/Admin.js";

// Login Controller
export const loginAdmin = async (req, res) => {

    try {
        const { userName, password, role } = req.body; // 👈 include role

        // Find admin with both username + role
        const admin = await Admin.findOne({ userName, role });
        if (!admin) {
            return res.status(400).json({ message: "Invalid username or role" });
        }

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid password" });
        }
        // Create JWT with role
        const token = jwt.sign(
            { id: admin._id, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // Store token in HttpOnly cookie
        res.cookie("gbr_admin", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production", // only https in prod
            sameSite: "lax",
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        });

        res.json({
            message: "Login successful",
            admin: { userName: admin.userName, role: admin.role },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};
