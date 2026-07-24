// هاد الملف بيتحقق مباشرة مع Stripe إنه الدفع صار فعلاً قبل ما يسمح بالدخول
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ paid: false, error: "لا يوجد رمز دفع" });
    }

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${session_id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        },
      }
    );

    if (!stripeRes.ok) {
      return res.status(200).json({ paid: false });
    }

    const session = await stripeRes.json();
    const paid = session.payment_status === "paid";

    return res.status(200).json({ paid });
  } catch (err) {
    console.error("Verify payment error:", err);
    return res.status(500).json({ paid: false, error: "صار خلل بالتحقق" });
  }
}
