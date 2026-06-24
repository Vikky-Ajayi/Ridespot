export const contactRepository = {
  async submitContact(_payload: {
    fullName: string;
    email: string;
    message: string;
  }) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
};
