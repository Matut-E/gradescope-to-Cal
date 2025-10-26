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
    // Send email via Resend (NOTE: Email is handled ephemerally - never stored in database)
    const data = await resend.emails.send({
      from: 'Gradescope to Cal <hello@gs2cal.me>',
      to: email,
      subject: 'Install Gradescope to Cal on Your Laptop',
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">

          <!-- Branding header -->
          <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #FDB515;">
            <h1 style="color: #003262; font-size: 24px; margin: 0;">📅 Gradescope to Cal</h1>
          </div>

          <!-- Main heading and intro -->
          <h2 style="color: #003262; font-weight: 600; margin-top: 30px;">Install on Your Laptop</h2>
          <p style="font-size: 16px; color: #333;">You visited our site on mobile. Here's your reminder:</p>

          <!-- Step-by-step instructions -->
          <div style="background: #f8f9fa; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #FDB515;">
            <ol style="margin: 0; padding-left: 20px; line-height: 2;">
              <li>Open <strong>Chrome, Brave, or Edge</strong> on your <strong>laptop or desktop</strong></li>
              <li>Visit <a href="https://www.gs2cal.me" target="_blank" rel="noopener" style="color: #003262; text-decoration: none; font-weight: 600;">gs2cal.me</a></li>
              <li>Click <strong>"Add to Chrome"</strong> (takes 30 seconds)</li>
            </ol>
          </div>

          <!-- Benefits box -->
          <div style="background: linear-gradient(135deg, #003262 0%, #005792 100%); padding: 24px; border-radius: 12px; margin: 24px 0;">
            <p style="color: #FDB515; font-weight: 700; margin: 0 0 16px 0; font-size: 18px;">What You Get:</p>
            <ul style="color: white; margin: 0; padding-left: 20px; line-height: 2; font-size: 15px;">
              <li>✅ Auto-sync to Google Calendar</li>
              <li>⏰ Never miss a Gradescope deadline</li>
              <li>🔒 Zero-server, privacy-first architecture</li>
              <li>🎓 Used by 40+ Berkeley students</li>
            </ul>
          </div>

          <!-- Privacy & Legal Compliance Section -->
          <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; border-left: 4px solid #0ea5e9; margin-top: 30px;">
            <p style="margin: 0 0 12px 0; color: #0c4a6e; font-size: 14px;">
              <strong>🔒 Privacy & Data Handling:</strong>
            </p>
            <ul style="margin: 0; padding-left: 20px; color: #0c4a6e; font-size: 13px; line-height: 1.8;">
              <li><strong>Your email address:</strong> We don't store it in any database. Sent directly through our email service provider (Resend) and deleted from their logs within 24 hours per their <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener" style="color: #0369a1; text-decoration: underline;">free plan policy</a>.</li>
              <li><strong>Purpose:</strong> One-time reminder to install our extension on your laptop. No marketing, tracking, or further emails.</li>
              <li><strong>Your rights:</strong> Your email is processed lawfully under legitimate interest (providing requested service). Contact hello@gs2cal.me for questions.</li>
            </ul>
          </div>

          <!-- Footer -->
          <p style="color: #999; font-size: 13px; text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            Questions? Visit <a href="https://www.gs2cal.me" target="_blank" rel="noopener" style="color: #003262; text-decoration: underline;">gs2cal.me</a> or check our
            <a href="https://github.com/Matut-E/gradescope-to-Cal" target="_blank" rel="noopener" style="color: #003262; text-decoration: underline;">open source code</a>
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
