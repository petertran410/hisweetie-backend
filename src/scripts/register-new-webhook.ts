import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const KIOTVIET_API_URL = 'https://public.kiotapi.com';
const WEBHOOK_URL =
  'https://api.hisweetievietnam.com/api/kiotviet/webhook/order-status';
const OLD_WEBHOOK_ID = 500218994;

async function getAccessToken(): Promise<string> {
  const tokenResponse = await axios.post(
    'https://id.kiotviet.vn/connect/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.KIOTVIET_CLIENT_ID!,
      client_secret: process.env.KIOTVIET_CLIENT_SECRET!,
      scope: 'PublicApi.Access',
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  return tokenResponse.data.access_token;
}

async function deleteWebhook(accessToken: string, webhookId: number) {
  try {
    await axios.delete(`${KIOTVIET_API_URL}/webhooks/${webhookId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Retailer: '2svn',
      },
    });
    console.log(`✅ Deleted old webhook ID: ${webhookId}`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log(`ℹ️ Webhook ${webhookId} not found (may be already deleted)`);
    } else {
      console.error(`⚠️ Error deleting webhook: ${error.message}`);
    }
  }
}

async function registerWebhook(accessToken: string) {
  const webhookSecret = process.env.KIOTVIET_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('KIOTVIET_WEBHOOK_SECRET not found in .env');
  }

  const webhookPayload = {
    Webhook: {
      Type: 'order.update',
      Url: WEBHOOK_URL,
      IsActive: true,
      Description: 'Webhook for order tracking - DiepTra Website',
      Secret: webhookSecret,
    },
  };

  console.log('\n➕ Registering new webhook...');
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

  return response.data;
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

async function main() {
  try {
    console.log('🔑 Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained');

    console.log(`\n🗑️ Deleting old webhook (ID: ${OLD_WEBHOOK_ID})...`);
    await deleteWebhook(accessToken, OLD_WEBHOOK_ID);

    console.log('\n⏳ Waiting 2 seconds...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newWebhook = await registerWebhook(accessToken);
    console.log('\n✅ New webhook registered!');
    console.log(JSON.stringify(newWebhook, null, 2));

    console.log('\n⏳ Waiting 2 seconds for KiotViet to process...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('\n📋 Current webhooks:');
    const webhooks = await listWebhooks(accessToken);
    console.log(JSON.stringify(webhooks, null, 2));

    const targetWebhook = webhooks.data?.find(
      (w: any) => w.url === WEBHOOK_URL && w.type === 'order.update',
    );

    if (targetWebhook) {
      console.log('\n🎯 Your active webhook:');
      console.log(`   ID: ${targetWebhook.id}`);
      console.log(`   Active: ${targetWebhook.isActive}`);
      console.log(`   URL: ${targetWebhook.url}`);
      console.log('\n📝 Update your .env file with new webhook ID:');
      console.log(`KIOTVIET_WEBHOOK_ID=${targetWebhook.id}`);
    }
  } catch (error: any) {
    console.error('\n❌ Error:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

main();
