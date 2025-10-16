import mongoose from 'mongoose';
import dns from 'dns/promises';


dns.setServers(['8.8.8.8']);


const connectDB = async () => {
    const uri = process.env.MONGO_URI;

    if (!uri) {
        console.log('MONGO_URI is missing in .env');
        process.exit(1);
    }

    try {
        await mongoose.connect(uri, {
            dbName: "gbr_db",   // 👈 this overrides the default "test"
            // Timeout settings
            connectTimeoutMS: 10000, // 10 seconds
            // socketTimeoutMS: 45000,  // 45 seconds
            // DNS resolution (optional): forces IPv4
            family: 4,
        });

        console.log('Connected to MongoDB Atlas');
    } catch (error) {
        console.log('MongoDB connection error:', error.message);
        process.exit(1);
    }
};

export default connectDB;
