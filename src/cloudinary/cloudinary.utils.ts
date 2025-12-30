import cloudinary from "./cloudinary.config";

export const deleteAvatar = async (url?: string) => {
  if (!url) return;

  const publicId = url.split("/").pop()?.split(".")[0];
  if (!publicId) return;

  await cloudinary.uploader.destroy(`avatars/${publicId}`);
};
