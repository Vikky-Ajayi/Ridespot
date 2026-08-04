declare module "flutterwave-node-v3" {
  interface FlutterwaveOptions {
    tx_ref: string;
    amount: number;
    currency: string;
    redirect_url: string;
    customer: { email: string; name: string };
    customizations: { title: string; description: string; logo: string };
    meta?: Record<string, unknown>;
  }

  interface FlutterwaveResponse {
    status: string;
    message: string;
    data: { link: string };
  }

  class Flutterwave {
    constructor(publicKey: string, secretKey: string);
    Charge: {
      initiate_payment(payload: FlutterwaveOptions): Promise<FlutterwaveResponse>;
    };
  }

  export = Flutterwave;
}
