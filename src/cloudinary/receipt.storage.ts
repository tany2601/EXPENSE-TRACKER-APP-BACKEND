import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.config";

export const receiptStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "receipts",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [
      { width: 1000, crop: "limit" },
      { quality: "auto" },
      { fetch_format: "auto" },
    ],
  }),
});
