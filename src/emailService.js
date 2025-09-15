const nodemailer = require('nodemailer');

// Email configuration - REPLACE WITH YOUR ACTUAL SMTP SETTINGS
const emailConfig = {
    host: 'smtp.example.com',
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
        user: 'your-email@example.com',
        pass: 'your-password-here'
    },
    tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
    }
};

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport(emailConfig);

// Verify connection configuration
async function verifyConnection() {
    try {
        await transporter.verify();
        console.log('Email server connection verified successfully');
        return { success: true, message: 'Email server connection verified' };
    } catch (error) {
        console.error('Email server connection error:', error);
        return { success: false, message: error.message };
    }
}

// Send email function
async function sendEmail(mailOptions) {
    try {
        // Set default from address if not provided
        if (!mailOptions.from) {
            mailOptions.from = '"DataX System" <noreply@example.com>';
        }

        // Send mail with defined transport object
        const info = await transporter.sendMail(mailOptions);
        
        console.log('Email sent successfully:', info.messageId);
        return {
            success: true,
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response
        };
    } catch (error) {
        console.error('Error sending email:', error);
        return {
            success: false,
            error: error.message,
            code: error.code,
            command: error.command
        };
    }
}

// Test email function
async function sendTestEmail(recipientEmail, subject, message) {
    const mailOptions = {
        from: '"DataX Test System" <noreply@example.com>',
        to: recipientEmail,
        subject: subject || 'Test Email from DataX System',
        text: message || 'This is a test email from the DataX system.',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                    <h1 style="color: white; margin: 0;">DataX System</h1>
                </div>
                <div style="padding: 20px; background: #f5f5f5;">
                    <h2 style="color: #333;">Test Email</h2>
                    <p style="color: #666; line-height: 1.6;">
                        ${message || 'This is a test email from the DataX system.'}
                    </p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <div style="background: white; padding: 15px; border-radius: 5px;">
                        <h3 style="color: #667eea; margin-top: 0;">Email Configuration Details:</h3>
                        <ul style="color: #666;">
                            <li>SMTP Server: smtp.example.com</li>
                            <li>Port: 465 (SSL/TLS)</li>
                            <li>From: noreply@example.com</li>
                            <li>Sent: ${new Date().toLocaleString()}</li>
                        </ul>
                    </div>
                </div>
                <div style="background: #333; color: #999; padding: 15px; text-align: center; font-size: 12px;">
                    <p style="margin: 0;">This is an automated email from DataX System</p>
                    <p style="margin: 5px 0 0 0;">© 2024 DataX. All rights reserved.</p>
                </div>
            </div>
        `
    };

    return await sendEmail(mailOptions);
}

module.exports = {
    transporter,
    verifyConnection,
    sendEmail,
    sendTestEmail,
    emailConfig
};