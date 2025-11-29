import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    console.log('🔄 Image upload proxy started');

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log('📁 File info:', {
      name: file.name,
      size: file.size,
      type: file.type,
    });

    // Accept image files
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only image files allowed' },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const backendFormData = new FormData();
    backendFormData.append(
      'file',
      new Blob([fileBuffer], { type: file.type }),
      file.name,
    );

    const backendUrl = `${process.env.NEXT_PUBLIC_API_DOMAIN}/api/file/upload`;
    console.log('🌐 Backend URL:', backendUrl);

    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'X-Force-Signature': process.env.NEXT_API_KEY,
      },
      body: backendFormData,
    });

    console.log('📊 Backend status:', backendResponse.status);

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      console.error('❌ Backend error:', errorText);
      return NextResponse.json(
        {
          error: `Backend failed: ${backendResponse.status}`,
        },
        { status: backendResponse.status },
      );
    }

    const result = await backendResponse.text();
    console.log('✅ Success:', result);

    return new NextResponse(result, { status: 200 });
  } catch (error) {
    console.error('❌ Proxy error:', error);
    return NextResponse.json(
      {
        error: `Server error: ${error.message}`,
      },
      { status: 500 },
    );
  }
}
