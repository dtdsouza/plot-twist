import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.json(null, { status: 401 });
  }

  try {
    const response = await fetch(`${API_URL}/user/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    if (response.status === 401) {
      return NextResponse.json(null, { status: 401 });
    }

    if (!response.ok) {
      // 5xx from backend is transient; the client should not interpret this
      // as "logged out". Surface the upstream status so AuthContext can decide.
      return NextResponse.json(
        { message: 'Profile temporarily unavailable' },
        { status: response.status }
      );
    }

    const user = await response.json();
    return NextResponse.json(user);
  } catch {
    return NextResponse.json(
      { message: 'Profile temporarily unavailable' },
      { status: 503 }
    );
  }
}
