import axios from 'axios';

const webhookData = {
  Id: 'test-webhook-id',
  Attempt: 1,
  Notifications: [
    {
      Action: 'update',
      Data: [
        {
          Id: 21373278,
          Code: 'DH027326',
          BranchId: 635934,
          SaleChannelId: 496738,
          Status: 5,
          StatusValue: 'Đã xác nhận',
          CustomerId: 40929370,
          CustomerName: 'Trần Ngọc Nhân',
          Total: 90000,
          ModifiedDate: '2025-10-13T13:45:19.5430000',
        },
      ],
    },
  ],
};

async function testWebhook() {
  try {
    const response = await axios.post(
      'https://api.hisweetievietnam.com/api/kiotviet/webhook/order-status',
      webhookData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('✅ Webhook test successful!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error(
      '❌ Webhook test failed:',
      error.response?.data || error.message,
    );
  }
}

testWebhook();
