import { Router } from 'express';
import {
  verifyWhatsAppWebhook,
  handleWhatsAppWebhook,
  getWebhookStatus,
} from '../controllers/webhook.controller.js';

const router = Router();

// 1. Meta Webhook Handshake Verification (GET)
router.get('/whatsapp', verifyWhatsAppWebhook);

// 2. Meta Event Ingestion Endpoint (POST)
router.post('/whatsapp', handleWhatsAppWebhook);

// 3. Health & Diagnostic Status (GET)
router.get('/whatsapp/status', getWebhookStatus);

export default router;
