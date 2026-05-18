import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

interface IRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: IRouteContext) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.json(
      { message: 'Authentication required', statusCode: 401 },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const body = await request.json();

  const response = await fetch(`${API_URL}/clubs/${id}/cover/finalize`, {
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
        message: data.message || 'Could not finalize cover upload',
        statusCode: response.status,
      },
      { status: response.status }
    );
  }

  return NextResponse.json(data);
}
