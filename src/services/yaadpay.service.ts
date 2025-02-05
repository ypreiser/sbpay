import env from '../config/env.ts';

export class YaadPayService {
  private static instance: YaadPayService;

  private constructor() {}

  public static getInstance(): YaadPayService {
    if (!YaadPayService.instance) {
      YaadPayService.instance = new YaadPayService();
    }
    return YaadPayService.instance;
  }

  async getPaymentUrl(transactionId: string, amount: number, customerName: string): Promise<string> {
    const signatureUrl = `https://icom.yaad.net/p/?${new URLSearchParams({
      action: "APISign",
      What: "SIGN",
      KEY: env.YAAD_KEY,
      PassP: env.YAAD_PassP,
      Masof: env.YAAD_MASOF,
      Order: transactionId,
      Amount: amount.toString(),
      ClientName: customerName,
      Currency: "1",
      tmp: "1",
    })}`;

    const signResponse = await fetch(signatureUrl);
    const signature = await signResponse.text();

    return `https://icom.yaad.net/p/?action=pay&${signature}`;
  }
} 