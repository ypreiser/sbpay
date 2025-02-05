import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller.js";

const router = Router();
const paymentController = new PaymentController();

router.post("/payment", (req, res) =>
  paymentController.processPayment(req, res)
);
router.get("/yaad-callback", (req, res) =>
  paymentController.handleYaadWebhook(req, res)
);
router.get("/payment-success", (req, res) =>
  paymentController.showSuccessPage(req, res)
);
router.get("/payment-cancelled", (req, res) =>
  paymentController.showCancelPage(req, res)
);

export default router;
