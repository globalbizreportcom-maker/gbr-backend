import jwt from "jsonwebtoken";
import User from "../../models/User.js";

export const verifyUser = async (req, res, next) => {
    const token = req.cookies?.gbr_user;
    if (!token) {
        return res.status(401).json({ message: "Not authenticated" });
    }

    try {
        // 🔑 Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 🔍 Fetch user from DB
        const user = await User.findOne({ email: decoded.email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const passwordSet = !!user.password;

        // Convert user to plain object and add passwordSet property
        const userData = user.toObject();

        // Remove actual password
        delete userData.password;
        userData.password = passwordSet;

        // Attach user to request
        req.user = userData;

        next();
    } catch (err) {
        console.error("JWT verify error:", err);
        return res.status(401).json({ message: "Invalid token" });
    }
};
