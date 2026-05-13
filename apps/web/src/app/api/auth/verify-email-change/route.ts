import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await fetch(`${API_URL}/auth/verify-email-change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      {
        message: data.message || 'Could not verify email change',
        statusCode: response.status,
      },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
