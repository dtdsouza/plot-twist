import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

interface IRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: IRouteContext) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.json(
      { message: 'Authentication required', statusCode: 401 },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  try {
    const response = await fetch(`${API_URL}/clubs/${id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: data.message || 'Could not fetch club', statusCode: response.status },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { message: 'Service temporarily unavailable', statusCode: 503 },
      { status: 503 }
    );
  }
}

export async function PATCH(request: NextRequest, context: IRouteContext) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.json(
      { message: 'Authentication required', statusCode: 401 },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const body = await request.json();

  try {
    const response = await fetch(`${API_URL}/clubs/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: data.message || 'Could not update club', statusCode: response.status },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { message: 'Service temporarily unavailable', statusCode: 503 },
      { status: 503 }
    );
  }
}

export async function DELETE(request: NextRequest, context: IRouteContext) {
  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.json(
      { message: 'Authentication required', statusCode: 401 },
      { status: 401 }
    );
  }

  const { id } = await context.params;

  try {
    const response = await fetch(`${API_URL}/clubs/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: data.message || 'Could not delete club', statusCode: response.status },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { message: 'Service temporarily unavailable', statusCode: 503 },
      { status: 503 }
    );
  }
}
