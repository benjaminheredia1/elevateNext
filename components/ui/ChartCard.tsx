'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface ChartCardProps {
  title: string;
  data: { name: string; value: number }[];
  color?: string;
}

export default function ChartCard({ title, data, color = '#ff5c19' }: ChartCardProps) {
  return (
    <div className="dash-card span-6">
      <div className="dash-card-header">
        <h3>{title}</h3>
      </div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="name" stroke="#7a9088" fontSize={12} />
            <YAxis stroke="#7a9088" fontSize={12} />
            <Tooltip contentStyle={{ background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
            <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
