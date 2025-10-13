import axios from 'axios';

const KIOTVIET_BASE_URL = 'https://public.kiotapi.com';
const KIOTVIET_TOKEN_URL = 'https://id.kiotviet.vn/connect/token';

const RETAILER_NAME = '2svn';
const CLIENT_ID = '1095f686-8725-4115-841e-ad9ded33b069';
const CLIENT_SECRET = '27559D6F051B661E758FB16AB0AC5695372FB998';

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

async function deleteWebhook(webhookId: number) {
  try {
    const token = await getAccessToken();

    await axios.delete(`${KIOTVIET_BASE_URL}/webhooks/${webhookId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Retailer: RETAILER_NAME,
      },
    });

    console.log(`✅ Webhook ${webhookId} deleted successfully!`);
  } catch (error) {
    console.error(
      '❌ Failed to delete webhook:',
      error.response?.data || error.message,
    );
  }
}

deleteWebhook(500217794);
