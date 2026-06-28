'use client';

import { reglasGet } from '@/stores/reglas';
import { ProgressSpinner } from 'primereact/progressspinner';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Button } from 'primereact/button';
import { clsx } from 'clsx';


export default function ReglasHorarias() {
    const { horarios, isLoading, isError, error } = reglasGet();

    if (isLoading) {
        return (
            <div className='flex h-screen  justify-center'>
                <ProgressSpinner />
            </div>
        )
    }
    if (isError) {
        return (
            <>
                <h1>Error: {error?.message}</h1>
            </>
        )
    }

    const actionBodyTemplate = () => {
        return (
            <div className={clsx('flex', 'gap-3')}>
                <Button
                    icon="pi pi-pencil text-xl"
                    outlined
                    severity="info"
                    onClick={() => console.log('edit')}
                    className={clsx('rounded-md', 'w-10', 'h-10', 'p-2')}
                />
                <Button
                    icon="pi pi-trash text-xl"
                    outlined
                    severity="danger"
                    onClick={() => console.log('delete')}
                    className={clsx('rounded-md', 'w-10', 'h-10', 'p-2')}
                />
            </div>
        );
    };

    const header = (
        <div className={clsx('flex', 'justify-between', 'items-center', 'mb-4')}>
            <h2 className={clsx('m-0', 'text-2xl', 'text-white', 'font-bold')}>
                Gestión de Reglas Horarias
            </h2>

            <Button
                label="Nuevo"
                icon="pi pi-plus"
                severity="success"
                onClick={() => {
                    console.log('nuevo');
                }}
                className={clsx('rounded-md', 'px-4', 'py-2', 'gap-2')}
            />
        </div>
    );

    return (
        <>
            <DataTable value={horarios?.data} tableStyle={{ minWidth: '50rem' }} header={header}>
                <Column field="id" header="id"></Column>
                <Column field="nombre" header="Name"></Column>
                <Column field="fecha_inicio" header="Fecha Inicio"></Column>
                <Column field="fecha_fin" header="Fecha Fin"></Column>
                <Column field="valor" header="Valor"></Column>
                <Column
                    header="Acciones"
                    body={actionBodyTemplate}
                    exportable={false}
                    style={{ minWidth: '12rem' }}
                ></Column>
            </DataTable>
        </>
    );
}