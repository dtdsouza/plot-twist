import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.json(null, { status: 401 });
  }

  try {
    // Decode JWT payload (base64) to extract user info
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    );

    return NextResponse.json({
      id: payload.sub,
      email: payload.email,
      displayName: payload.displayName,
      avatar: payload.avatar || null,
      bio: payload.bio || null,
      createdAt: payload.createdAt,
    });
  } catch {
    return NextResponse.json(null, { status: 401 });
  }
}
