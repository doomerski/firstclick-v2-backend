const nodemailer = require('nodemailer');
const ENV = require('./config/env');

// Email transporter configuration
// Supports both real SMTP and development mode (console output)
let transporter;

const initEmailService = () => {
  if (ENV.emailMode === 'smtp') {
    const baseTransport = ENV.emailService
      ? {
          service: ENV.emailService,
          auth: {
            user: ENV.emailUser,
            pass: ENV.emailPassword
          }
        }
      : {
          host: ENV.emailHost,
          port: ENV.emailPort,
          secure: ENV.emailSecure,
          auth: {
            user: ENV.emailUser,
            pass: ENV.emailPassword
          }
        };

    transporter = nodemailer.createTransport(baseTransport);
  } else {
    // Development / console mode delivers to local SMTP catcher such as MailHog
    transporter = nodemailer.createTransport({
      host: ENV.emailHost,
      port: ENV.emailPort,
      secure: false,
      auth: null
    });
  }

  console.log(`📧 Email service initialized (${ENV.emailMode})`);
};

// Email templates
const emailTemplates = {
  applicationApproved: (applicantName, cityName, reviewerNotes) => ({
    subject: `Application Approved - Join ${cityName} Team`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .footer { text-align: center; color: #666; font-size: 12px; }
            .highlight { background: #d1fae5; padding: 15px; border-left: 4px solid #10b981; margin: 15px 0; border-radius: 4px; }
            .notes { background: #fff; padding: 15px; border: 1px solid #e5e7eb; border-radius: 4px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Application Approved!</h1>
            </div>
            
            <div class="content">
              <p>Hi ${applicantName},</p>
              
              <p>Great news! Your application to join the <strong>${cityName}</strong> team has been <strong>approved</strong>!</p>
              
              <div class="highlight">
                <strong>Next Steps:</strong>
                <ul>
                  <li>A team lead will contact you shortly with onboarding details</li>
                  <li>You'll receive an email with your access credentials</li>
                  <li>Expect first contact within 24-48 hours</li>
                </ul>
              </div>
              
              ${reviewerNotes ? `
                <div class="notes">
                  <strong>Reviewer Notes:</strong>
                  <p>${reviewerNotes}</p>
                </div>
              ` : ''}
              
              <p>If you have any questions, feel free to reach out to our team.</p>
              
              <p>Welcome to FirstClick!</p>
            </div>
            
            <div class="footer">
              <p>FirstClick Team | © 2026</p>
              <p><a href="https://firstclick.local">Visit FirstClick</a></p>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  applicationRejected: (applicantName, cityName, reviewerNotes) => ({
    subject: `Application Decision - ${cityName} Team`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6b7280, #4b5563); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .footer { text-align: center; color: #666; font-size: 12px; }
            .message { background: #fff; padding: 15px; border-left: 4px solid #6b7280; margin: 15px 0; border-radius: 4px; }
            .notes { background: #f3f4f6; padding: 15px; border: 1px solid #e5e7eb; border-radius: 4px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Application Decision</h1>
            </div>
            
            <div class="content">
              <p>Hi ${applicantName},</p>
              
              <div class="message">
                <p>Thank you for your interest in joining our <strong>${cityName}</strong> team. After careful review of your application, we have decided to move forward with other candidates at this time.</p>
              </div>
              
              ${reviewerNotes ? `
                <div class="notes">
                  <strong>Feedback:</strong>
                  <p>${reviewerNotes}</p>
                </div>
              ` : ''}
              
              <p>We appreciate your interest in FirstClick and encourage you to apply again in the future. Our needs change, and we'd love to consider you for other opportunities.</p>
              
              <p>If you have questions, please don't hesitate to reach out.</p>
              
              <p>Best regards,<br>FirstClick Team</p>
            </div>
            
            <div class="footer">
              <p>FirstClick Team | © 2026</p>
              <p><a href="https://firstclick.local">Visit FirstClick</a></p>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  newApplicationNotification: (applicantName, applicantEmail, cityName, roles, superadminLink) => ({
    subject: `New Team Application - ${cityName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .applicant-info { background: #fff; padding: 15px; border: 1px solid #e5e7eb; border-radius: 4px; margin: 15px 0; }
            .info-row { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
            .info-row:last-child { border-bottom: none; }
            .label { font-weight: bold; color: #6b7280; }
            .action-button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 15px; }
            .footer { text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔔 New Team Application</h1>
            </div>
            
            <div class="content">
              <p>A new person has applied to join your team!</p>
              
              <div class="applicant-info">
                <div class="info-row">
                  <span class="label">Name:</span> ${applicantName}
                </div>
                <div class="info-row">
                  <span class="label">Email:</span> ${applicantEmail}
                </div>
                <div class="info-row">
                  <span class="label">City:</span> ${cityName}
                </div>
                <div class="info-row">
                  <span class="label">Interested Roles:</span> ${Array.isArray(roles) ? roles.join(', ') : roles}
                </div>
              </div>
              
              <p>Review this application and provide your feedback:</p>
              
              <a href="${superadminLink}" class="action-button">Review Application</a>
              
              <p>Log in to your admin dashboard to view the full application details, download the resume, and approve or reject the application.</p>
            </div>
            
            <div class="footer">
              <p>FirstClick Admin | © 2026</p>
            </div>
          </div>
        </body>
      </html>
    `
  })
};

// Send approval email
const sendApprovalEmail = async (applicantEmail, applicantName, cityName, reviewerNotes = '') => {
  try {
    const template = emailTemplates.applicationApproved(applicantName, cityName, reviewerNotes);
    
    await transporter.sendMail({
      from: ENV.emailFrom,
      to: applicantEmail,
      subject: template.subject,
      html: template.html
    });
    
    console.log(`✅ Approval email sent to ${applicantEmail}`);
    return { success: true, message: 'Approval email sent' };
  } catch (error) {
    console.error('❌ Error sending approval email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send rejection email
const sendRejectionEmail = async (applicantEmail, applicantName, cityName, reviewerNotes = '') => {
  try {
    const template = emailTemplates.applicationRejected(applicantName, cityName, reviewerNotes);
    
    await transporter.sendMail({
      from: ENV.emailFrom,
      to: applicantEmail,
      subject: template.subject,
      html: template.html
    });
    
    console.log(`✅ Rejection email sent to ${applicantEmail}`);
    return { success: true, message: 'Rejection email sent' };
  } catch (error) {
    console.error('❌ Error sending rejection email:', error.message);
    return { success: false, error: error.message };
  }
};

// Send new application notification to superadmin
const sendNewApplicationNotification = async (applicantName, applicantEmail, cityName, roles, superadminEmail, adminDashboardLink) => {
  try {
    const template = emailTemplates.newApplicationNotification(
      applicantName,
      applicantEmail,
      cityName,
      roles,
      adminDashboardLink
    );
    
    await transporter.sendMail({
      from: ENV.emailFrom,
      to: superadminEmail,
      subject: template.subject,
      html: template.html
    });
    
    console.log(`✅ New application notification sent to ${superadminEmail}`);
    return { success: true, message: 'Notification email sent' };
  } catch (error) {
    console.error('❌ Error sending notification email:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  initEmailService,
  sendApprovalEmail,
  sendRejectionEmail,
  sendNewApplicationNotification
};
