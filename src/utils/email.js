import nodemailer from "nodemailer";

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: process.env.SMTP_SERVICE,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
};

export const sendEmail = async ({ to, subject, html }) => {
  await getTransporter().sendMail({
    from: `"${process.env.SERVICE_NAME}" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  });
};

export const sendOTPEmail = async (email, otp) => {
  await sendEmail({
    to: email,
    subject: "AgroClima - Verification Code",
    html: `
      <div style="font-family:Arial; max-width:400px; margin:0 auto; padding:20px;">
        <h2 style="color:#2E7D32;">AgroClima</h2>
        <p>Your 6-digit verification code is:</p>
        <h1 style="letter-spacing:8px; text-align:center; color:#333;">${otp}</h1>
        <p style="color:#666;">This code expires in 10 minutes.</p>
      </div>
    `,
  });
}