import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const KIOTVIET_API_URL = 'https://public.kiotapi.com';
const OLD_WEBHOOK_ID = 500218992;
const WEBHOOK_URL =
  'https://api.hisweetievietnam.com/api/kiotviet/webhook/order-status';

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
    console.log(`✅ Deleted webhook ID: ${webhookId}`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log(`ℹ️ Webhook ${webhookId} already deleted or not found`);
    } else {
      throw error;
    }
  }
}

async function createWebhook(accessToken: string) {
  const response = await axios.post(
    `${KIOTVIET_API_URL}/webhooks`,
    {
      Type: 'order.update',
      Url: WEBHOOK_URL,
      IsActive: true,
      Description: 'Webhook for order tracking - DiepTra Website',
    },
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

async function activateWebhook() {
  try {
    const accessToken = await getAccessToken();
    console.log('🔑 Access token obtained');

    console.log('🗑️ Deleting old webhook...');
    await deleteWebhook(accessToken, OLD_WEBHOOK_ID);

    console.log('➕ Creating new active webhook...');
    await createWebhook(accessToken);

    console.log('⏳ Waiting 2 seconds for KiotViet to process...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('📋 Fetching updated webhook list...');
    const webhooks = await listWebhooks(accessToken);

    console.log('\n✅ Current Webhooks:');
    console.log(JSON.stringify(webhooks, null, 2));

    const orderWebhooks = webhooks.data?.filter(
      (w: any) => w.type === 'order.update' && w.url === WEBHOOK_URL,
    );

    if (orderWebhooks && orderWebhooks.length > 0) {
      const activeWebhook = orderWebhooks[0];
      console.log('\n🎯 Your active webhook:');
      console.log(`   ID: ${activeWebhook.id}`);
      console.log(`   Type: ${activeWebhook.type}`);
      console.log(`   URL: ${activeWebhook.url}`);
      console.log(`   Active: ${activeWebhook.isActive}`);
      console.log(`   Description: ${activeWebhook.description}`);
    } else {
      console.log('\n⚠️ Could not find the newly created webhook');
    }
  } catch (error: any) {
    console.error('❌ Error activating webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

activateWebhook();
