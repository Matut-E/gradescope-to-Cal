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
            <h1 style="color: #003262; font-size: 28px; margin: 0; font-weight: 700;">📅 Gradescope to Cal</h1>
            <p style="color: #666; font-size: 14px; margin: 8px 0 0 0;">Never miss another deadline</p>
          </div>

          <!-- Main heading and intro -->
          <h2 style="color: #003262; font-weight: 600; margin-top: 30px; font-size: 22px;">Install on Your Laptop 💻</h2>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">You visited our site on mobile. Here's your quick setup reminder—takes less than a minute!</p>

          <!-- Step-by-step instructions -->
          <div style="background: #f8f9fa; padding: 24px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #FDB515;">
            <p style="margin: 0 0 16px 0; color: #003262; font-weight: 600; font-size: 16px;">Quick Setup (30 seconds):</p>
            <ol style="margin: 0; padding-left: 20px; line-height: 2; color: #333; font-size: 15px;">
              <li>Open <strong>Chrome, Brave, Edge, or Firefox</strong> on your laptop/desktop</li>
              <li>Visit <a href="https://gs2cal.me" target="_blank" rel="noopener" style="color: #003262; text-decoration: none; font-weight: 600; border-bottom: 2px solid #FDB515;">gs2cal.me</a></li>
              <li>Click <strong>"Add to Chrome"</strong> (or "Add to Firefox") and you're done!</li>
            </ol>
          </div>

          <!-- Benefits box -->
          <div style="background: linear-gradient(135deg, #003262 0%, #005792 100%); padding: 28px; border-radius: 12px; margin: 24px 0; box-shadow: 0 4px 12px rgba(0, 50, 98, 0.15);">
            <p style="color: #FDB515; font-weight: 700; margin: 0 0 18px 0; font-size: 19px;">Why 60+ Berkeley Students Love It:</p>
            <ul style="color: white; margin: 0; padding-left: 20px; line-height: 2.2; font-size: 15px; list-style: none;">
              <li style="margin-bottom: 8px;">✅ <strong>Auto-sync</strong> to Google Calendar—assignments appear instantly</li>
              <li style="margin-bottom: 8px;">⏰ <strong>Smart reminders</strong>—never miss a Gradescope deadline again</li>
              <li style="margin-bottom: 8px;">🔒 <strong>Privacy-first</strong>—zero-server architecture, all data stays on your device</li>
              <li style="margin-bottom: 8px;">⚡ <strong>Open source</strong>—fully transparent code you can audit yourself</li>
              <li>🎓 <strong>Built by students, for students</strong>—at UC Berkeley</li>
            </ul>
          </div>

          <!-- Social proof callout -->
          <div style="text-align: center; padding: 20px; background: #FFF9E6; border-radius: 8px; margin: 24px 0;">
            <p style="margin: 0; color: #003262; font-size: 16px;">
              <strong>"Finally, all my deadlines in one place. Should've installed this months ago!"</strong><br>
              <span style="color: #666; font-size: 14px;">— Berkeley EECS student</span>
            </p>
          </div>

          <!-- Privacy & Legal Compliance Section -->
          <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #0ea5e9; margin-top: 30px;">
            <p style="margin: 0 0 12px 0; color: #0c4a6e; font-size: 15px; font-weight: 600;">
              🔒 Privacy & Data Handling
            </p>
            <ul style="margin: 0; padding-left: 20px; color: #0c4a6e; font-size: 13px; line-height: 1.8;">
              <li><strong>Your email:</strong> Not stored in any database. Sent through Resend and deleted within 24 hours per their <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener" style="color: #0369a1; text-decoration: underline;">privacy policy</a>.</li>
              <li><strong>Purpose:</strong> One-time installation reminder. No marketing, tracking, or future emails.</li>
              <li><strong>Your rights:</strong> Processed under legitimate interest (service delivery). Questions? Email <a href="mailto:hello@gs2cal.me" style="color: #0369a1; text-decoration: underline;">hello@gs2cal.me</a></li>
            </ul>
          </div>

          <!-- Clear CTA button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://gs2cal.me" target="_blank" rel="noopener" style="display: inline-block; background: #FDB515; color: #003262; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; box-shadow: 0 4px 8px rgba(253, 181, 21, 0.3);">
              Install Gradescope to Cal →
            </a>
          </div>

          <!-- Footer -->
          <p style="color: #999; font-size: 13px; text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; line-height: 1.6;">
            Questions? Visit <a href="https://gs2cal.me" target="_blank" rel="noopener" style="color: #003262; text-decoration: underline;">gs2cal.me</a> or check our
            <a href="https://github.com/Matut-E/gradescope-to-Cal" target="_blank" rel="noopener" style="color: #003262; text-decoration: underline;">open source code</a> on GitHub
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
