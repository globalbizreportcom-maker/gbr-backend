import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dwccr86av',
    api_key: process.env.CLOUDINARY_API_KEY || '713382561538355',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'YbrCXnkWzxZVBAH1wjCSEdX-TxE',
});

export default cloudinary;
