// @ts-nocheck
export const isValidPhone = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
};

export const isValidOtp = (otp: string) => {
  return /^\d{6}$/.test(otp);
};
