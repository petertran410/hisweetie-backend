import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const KIOTVIET_API_URL = 'https://public.kiotapi.com';
const KIOTVIET_TOKEN_URL = 'https://id.kiotviet.vn/connect/token';
const WEBHOOK_URL =
  'https://api.hisweetievietnam.com/api/kiotviet/webhook/order-status';

async function getAccessToken(): Promise<string> {
  const params = new URLSearchParams();
  params.append('scopes', 'PublicApi.Access');
  params.append('grant_type', 'client_credentials');
  params.append('client_id', process.env.KIOTVIET_CLIENT_ID!);
  params.append('client_secret', process.env.KIOTVIET_CLIENT_SECRET!);

  const response = await axios.post(KIOTVIET_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token;
}

function generateSecret(): string {
  const randomSecret = crypto.randomBytes(16).toString('hex');
  return Buffer.from(randomSecret).toString('base64');
}

async function listWebhooks(accessToken: string) {
  const response = await axios.get(`${KIOTVIET_API_URL}/webhooks`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Retailer: '2svn',
    },
  });
  return response.data;
}

async function registerWebhook() {
  try {
    const accessToken = await getAccessToken();
    console.log('🔑 Access token obtained');

    const secret = generateSecret();
    console.log('🔐 Generated Secret:', secret);

    const webhookPayload = {
      Webhook: {
        Type: 'order.update',
        Url: WEBHOOK_URL,
        IsActive: true,
        Description: 'Webhook for order tracking - DiepTra Website',
        Secret: secret,
      },
    };

    console.log('\n➕ Registering webhook with payload:');
    console.log(JSON.stringify(webhookPayload, null, 2));

    const response = await axios.post(
      `${KIOTVIET_API_URL}/webhooks`,
      webhookPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Retailer: '2svn',
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('\n✅ Response Status:', response.status);
    console.log('📦 Response Data:', JSON.stringify(response.data, null, 2));

    console.log('\n⏳ Waiting 3 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log('📋 Fetching webhook list...');
    const webhooks = await listWebhooks(accessToken);

    const myWebhook = webhooks.data?.find(
      (w: any) => w.url === WEBHOOK_URL && w.type === 'order.update',
    );

    if (myWebhook) {
      console.log('\n🎯 Webhook registered successfully!');
      console.log(`   ID: ${myWebhook.id}`);
      console.log(`   Type: ${myWebhook.type}`);
      console.log(`   Active: ${myWebhook.isActive}`);
      console.log(`   URL: ${myWebhook.url}`);
      console.log('\n📝 Add this to your .env file:');
      console.log(`KIOTVIET_WEBHOOK_SECRET="${secret}"`);
      console.log(`KIOTVIET_WEBHOOK_ID=${myWebhook.id}`);
    } else {
      console.log('\n⚠️ Webhook created but not found in list yet');
      console.log('Current webhooks:', JSON.stringify(webhooks, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Error:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

registerWebhook();
