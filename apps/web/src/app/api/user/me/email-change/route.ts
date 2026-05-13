import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.json(
      { message: 'Authentication required', statusCode: 401 },
      { status: 401 }
    );
  }

  const body = await request.json();

  const response = await fetch(`${API_URL}/user/me/email-change`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      {
        message: data.message || 'Could not start email change',
        statusCode: response.status,
      },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
