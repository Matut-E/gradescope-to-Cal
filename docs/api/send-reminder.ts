import { Resend } from 'resend';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  // Basic email validation
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    // Send email via Resend
    const data = await resend.emails.send({
      from: 'Gradescope to Cal <noreply@gstocal.me>',
      to: email,
      subject: 'Install Gradescope to Cal on Your Laptop',
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #003262; font-weight: 600;">Install Gradescope to Cal</h2>

          <p>Hi! You visited our site on mobile and wanted a reminder to install on your laptop.</p>

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; font-weight: 600;">To install on your laptop:</p>
            <ol style="margin: 0; padding-left: 20px;">
              <li style="margin-bottom: 8px;">Open <strong>Chrome, Brave, or Edge</strong> on your <strong>laptop or desktop</strong></li>
              <li style="margin-bottom: 8px;">Visit <a href="https://gstocal.me" style="color: #003262; font-weight: 600; text-decoration: none;">gstocal.me</a></li>
              <li>Click "Add to Chrome" (takes 30 seconds)</li>
            </ol>
          </div>

          <div style="background: linear-gradient(135deg, #003262 0%, #005792 100%); padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="color: white; font-weight: 600; margin: 0 0 12px 0;">What you get:</p>
            <ul style="color: white; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>✓ Automatic sync to Google Calendar</li>
              <li>✓ Never miss a Gradescope deadline</li>
              <li>✓ Zero-server, open source, privacy-first</li>
              <li>✓ Used by 200+ Berkeley students</li>
            </ul>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
            <strong>Privacy promise:</strong> We sent you this one email and immediately deleted your address. No storage, no tracking, no spam. Ever.
          </p>

          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
            Questions? Visit <a href="https://gstocal.me" style="color: #003262;">gstocal.me</a>
          </p>
        </div>
      `
    });

    console.log('Email sent successfully:', data);

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Error sending email:', error);

    return res.status(500).json({
      error: 'Failed to send email',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
}
