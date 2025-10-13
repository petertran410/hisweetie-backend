import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const KIOTVIET_API_URL = 'https://public.kiotapi.com';
const WEBHOOK_ID = 500218994;

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

async function getWebhookDetails(accessToken: string, webhookId: number) {
  const response = await axios.get(
    `${KIOTVIET_API_URL}/webhooks/${webhookId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Retailer: '2svn',
      },
    },
  );
  return response.data;
}

async function updateWebhook(accessToken: string, webhookId: number) {
  const currentWebhook = await getWebhookDetails(accessToken, webhookId);

  const response = await axios.put(
    `${KIOTVIET_API_URL}/webhooks/${webhookId}`,
    {
      Type: currentWebhook.type,
      Url: currentWebhook.url,
      IsActive: true,
      Description:
        currentWebhook.description ||
        'Webhook for order tracking - DiepTra Website',
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

async function reactivateWebhook() {
  try {
    console.log('🔑 Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained');

    console.log(`\n📋 Current webhook status (ID: ${WEBHOOK_ID}):`);
    const currentDetails = await getWebhookDetails(accessToken, WEBHOOK_ID);
    console.log(JSON.stringify(currentDetails, null, 2));

    console.log('\n🔄 Updating webhook to activate...');
    await updateWebhook(accessToken, WEBHOOK_ID);

    console.log('\n⏳ Waiting 2 seconds for KiotViet to process...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log('\n📋 Registered Webhooks:');
    const webhooks = await listWebhooks(accessToken);
    console.log(JSON.stringify(webhooks, null, 2));

    const targetWebhook = webhooks.data?.find((w: any) => w.id === WEBHOOK_ID);
    if (targetWebhook && targetWebhook.isActive) {
      console.log('\n✅ Webhook successfully reactivated!');
      console.log(`   ID: ${targetWebhook.id}`);
      console.log(`   Active: ${targetWebhook.isActive}`);
      console.log(`   URL: ${targetWebhook.url}`);
    } else {
      console.log('\n⚠️ Webhook may not be activated yet. Check status above.');
    }
  } catch (error: any) {
    console.error('❌ Error reactivating webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

reactivateWebhook();
