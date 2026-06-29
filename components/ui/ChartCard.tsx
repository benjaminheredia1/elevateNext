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
            <CartesianGrid stroke="#e4ebe6" vertical={false} />
            <XAxis dataKey="name" stroke="#6f827a" fontSize={12} />
            <YAxis stroke="#6f827a" fontSize={12} />
            <Tooltip
              cursor={{ fill: 'rgba(20, 52, 42, .05)' }}
              contentStyle={{ background: '#fff', border: '1px solid #dde6df', borderRadius: 8, color: '#14342a' }}
              labelStyle={{ color: '#14342a', fontWeight: 700 }}
            />
            <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
