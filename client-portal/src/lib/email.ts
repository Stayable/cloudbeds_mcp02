import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const magicLink = `${appUrl}/auth/verify?token=${token}`

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@investorportal.com',
    to: email,
    subject: 'Sign in to Investor Portal',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Investor Portal</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1e3a5f; margin-top: 0;">Sign in to your account</h2>
            <p>Click the button below to securely sign in to your investor portal. This link will expire in 15 minutes.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${magicLink}" style="background: #1e3a5f; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Sign In</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this email, you can safely ignore it.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${magicLink}" style="color: #2d5a87; word-break: break-all;">${magicLink}</a>
            </p>
          </div>
        </body>
      </html>
    `,
    text: `Sign in to Investor Portal\n\nClick this link to sign in: ${magicLink}\n\nThis link will expire in 15 minutes.\n\nIf you didn't request this email, you can safely ignore it.`,
  }

  await transporter.sendMail(mailOptions)
}

export async function sendCapitalCallEmail(
  email: string,
  name: string,
  amount: number,
  dueDate: Date,
  propertyName: string
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dueDate)

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'noreply@investorportal.com',
    to: email,
    subject: `Capital Call Notice - ${propertyName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Investor Portal</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1e3a5f; margin-top: 0;">Capital Call Notice</h2>
            <p>Dear ${name},</p>
            <p>A capital call has been issued for your investment in <strong>${propertyName}</strong>.</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0;"><strong>Amount Due:</strong> ${formattedAmount}</p>
              <p style="margin: 0;"><strong>Due Date:</strong> ${formattedDate}</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${appUrl}/capital" style="background: #1e3a5f; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Details</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Please log in to your investor portal for complete details and payment instructions.</p>
          </div>
        </body>
      </html>
    `,
    text: `Capital Call Notice\n\nDear ${name},\n\nA capital call has been issued for your investment in ${propertyName}.\n\nAmount Due: ${formattedAmount}\nDue Date: ${formattedDate}\n\nPlease log in to your investor portal for complete details and payment instructions.\n\n${appUrl}/capital`,
  }

  await transporter.sendMail(mailOptions)
}
