import axios from 'axios';
import * as crypto from 'crypto';

const KIOTVIET_BASE_URL = 'https://public.kiotapi.com';
const KIOTVIET_TOKEN_URL = 'https://id.kiotviet.vn/connect/token';

const RETAILER_NAME = '2svn';
const CLIENT_ID = '1095f686-8725-4115-841e-ad9ded33b069';
const CLIENT_SECRET = '27559D6F051B661E758FB16AB0AC5695372FB998';
const WEBHOOK_URL =
  'https://api.hisweetievietnam.com/api/kiotviet/webhook/order-status';

async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams();
  params.append('scopes', 'PublicApi.Access');
  params.append('grant_type', 'client_credentials');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);

  const response = await axios.post(KIOTVIET_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token;
}

function generateSecret(): string {
  const randomSecret = crypto.randomBytes(16).toString('hex');
  return Buffer.from(randomSecret).toString('base64');
}

async function registerWebhook() {
  try {
    const token = await getAccessToken();
    const secret = generateSecret();

    console.log('🔐 Generated Secret (save this):', secret);

    const webhookPayload = {
      Webhook: {
        Type: 'order.update',
        Url: WEBHOOK_URL,
        IsActive: true,
        Description: 'Webhook for order status updates',
        Secret: secret,
      },
    };

    const response = await axios.post(
      `${KIOTVIET_BASE_URL}/webhooks`,
      webhookPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Retailer: RETAILER_NAME,
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('✅ Webhook registered successfully!');
    console.log('Webhook ID:', response.data.id);
    console.log('Webhook Details:', JSON.stringify(response.data, null, 2));
    console.log('\n📝 Add this to your .env file:');
    console.log(`KIOTVIET_WEBHOOK_SECRET="${secret}"`);
  } catch (error) {
    console.error(
      '❌ Failed to register webhook:',
      error.response?.data || error.message,
    );
  }
}

registerWebhook();
