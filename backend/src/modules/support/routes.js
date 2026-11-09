const crypto = require('node:crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const {z} = require('zod');
const {asyncRoute} = require('../../core/errors');
const {parse} = require('../../core/validation');
const {sendResendEmail} = require('./resend');

const router = express.Router();
const ticketInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  phone: z.string().trim().max(30).default(''),
  subject: z.string().trim().min(4).max(160),
  category: z.enum(['account', 'rent', 'maintenance', 'payment', 'other']),
  message: z.string().trim().min(10).max(5000),
});
const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

router.post('/tickets', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}), asyncRoute(async (req, res) => {
  const input = parse(ticketInput, req.body);
  const {RESEND_API_KEY, RESEND_TEMPLATE_ID, RESEND_FROM_EMAIL, CONTACT_EMAIL} = process.env;
  if (!RESEND_API_KEY || !RESEND_TEMPLATE_ID || !RESEND_FROM_EMAIL || !CONTACT_EMAIL) {
    return res.status(503).json({
      error: {code: 'SUPPORT_EMAIL_NOT_CONFIGURED', message: 'Support email is not configured. Please try again later.'},
    });
  }

  const ticketId = `RR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const submittedAt = new Date().toISOString();
  const templateVariables = {
    ticketId,
    name: input.name,
    email: input.email,
    phone: input.phone || 'Not provided',
    PHONE: input.phone || 'Not provided',
    subject: input.subject,
    category: input.category,
    message: input.message,
    submittedAt,
  };

  try {
    await sendResendEmail({
      from: RESEND_FROM_EMAIL,
      to: [CONTACT_EMAIL],
      reply_to: input.email,
      template: {id: RESEND_TEMPLATE_ID, variables: templateVariables},
    });
  } catch (error) {
    console.error('[Support email delivery failed]', error.message);
    return res.status(502).json({
      error: {code: 'SUPPORT_EMAIL_FAILED', message: 'We could not submit your support request. Please try again later.'},
    });
  }

  const confirmationText = [
    `Hi ${input.name},`,
    '',
    `We received your RoomRent support request (${ticketId}).`,
    `Subject: ${input.subject}`,
    `Category: ${input.category}`,
    '',
    'Our support team will get back to you.',
  ].join('\n');
  const escapedName = escapeHtml(input.name);
  const escapedSubject = escapeHtml(input.subject);
  const confirmation = {
    from: RESEND_FROM_EMAIL,
    to: [input.email],
    subject: `We received your RoomRent support request (${ticketId})`,
    text: confirmationText,
    html: `<p>Hi ${escapedName},</p><p>We received your RoomRent support request.</p><p><strong>Reference:</strong> ${ticketId}<br><strong>Subject:</strong> ${escapedSubject}<br><strong>Category:</strong> ${input.category}</p><p>Our support team will get back to you.</p>`,
  };

  try {
    await sendResendEmail(confirmation);
  } catch (error) {
    console.error('[Support confirmation email failed]', error.message);
    return res.status(202).json({
      data: {
        ticketId,
        confirmationSent: false,
        message: 'Your request reached support, but the confirmation email could not be sent.',
      },
    });
  }

  return res.status(201).json({
    data: {
      ticketId,
      confirmationSent: true,
      message: 'Your support request was submitted. A confirmation email has been sent.',
    },
  });
}));

module.exports = router;
