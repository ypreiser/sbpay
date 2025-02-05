import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';

const router = Router();
const paymentController = new PaymentController();

router.post('/payment', (req, res) => paymentController.processPayment(req, res));
router.get('/yaad-callback', (req, res) => paymentController.handleYaadWebhook(req, res));

export default router; 