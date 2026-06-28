'use client';

import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { listCategory } from '@/stores/categoria';
import { Button } from 'primereact/button';
import { clsx } from 'clsx';
import { useState } from 'react';
import FormModal from '@/components/FormModal';
import { postCategory, DeleteCategory, EditCategory } from '@/stores/categoria';
import ConfirmDialog from '@/components/ConfirmDialog';


export default function Category() {
    const { categories, isLoading, isError: isGetError, error: getError } = listCategory();
    const { createCategory, isPending, isError: isPostError, error: postError } = postCategory();
    const { deleteCategory } = DeleteCategory();
    const { editCategory } = EditCategory();
    const [openModal, setOpenModal] = useState(false);
    const [nombre, setNombre] = useState('');
    const [detalles, setDetalles] = useState('');
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [type, setType] = useState<'create' | 'edit'>('create');
    const [id, setId] = useState<number>(0);
    const [visibleDialog, setVisibleDialog] = useState(false);

    const fieldsCategory = [
        {
            label: 'nombre',
            value: nombre,
            type: 'text' as const,
            onChange: (val: string) => setNombre(val),
            required: true
        },
        {
            label: 'detalles',
            value: detalles,
            type: 'text' as const,
            onChange: (val: string) => setDetalles(val),
            required: true
        },
    ];


    if (isLoading || isPending) return <div>Loading...</div>;
    if (isGetError || isPostError) return <div>Error: {getError?.message || postError?.message}</div>;

        const header = (
            <div className={clsx('flex', 'justify-between', 'items-center', 'mb-4')}>
                <h2 className={clsx('m-0', 'text-2xl', 'text-white', 'font-bold')}>
                    Gestión de Categorías
                </h2>

                <Button
                    label="Nuevo"
                    icon="pi pi-plus"
                    severity="success"
                    onClick={() => {
                        setOpenModal(true);
                        setType('create');
                    }}
                    className={clsx('rounded-md', 'px-4', 'py-2', 'gap-2')}
                />
            </div>
        );
    const handleSubmit = () => {
        if (type === 'create') {
            setTitle('Categoría');
            setSubtitle('Crear categoría');
            createCategory({
                nombre,
                detalles
            });
            setOpenModal(false);

        } else {
            editCategory({
                id,
                nombre,
                detalles
            });
        }
    };
    function Delete(id: number) {
        setId(id);
        setVisibleDialog(true)
    }
    function ConfirmDelete() {
        deleteCategory(Number(id));
        setVisibleDialog(false);
        setNombre('');
        setDetalles('');
    }

    function Editar(rowData: any) {
        setId(rowData.id);
        setNombre(rowData.nombre);
        setDetalles(rowData.detalles);
        setId(rowData.id);
        setType('edit');
        setOpenModal(true);

    }
    const actionBodyTemplate = (rowData: any) => {
        return (
            <div className={clsx('flex', 'gap-3')}>
                <Button
                    icon="pi pi-pencil text-xl"
                    outlined
                    severity="info"
                    onClick={() => Editar(rowData)}
                    className={clsx('rounded-md', 'w-10', 'h-10', 'p-2')}
                />
                <Button
                    icon="pi pi-trash text-xl"
                    outlined
                    severity="danger"
                    onClick={() => Delete(rowData.id)}
                    className={clsx('rounded-md', 'w-10', 'h-10', 'p-2')}
                />
            </div>
        );
    };
    return (
        <>
            <ConfirmDialog isOpen={visibleDialog} onClose={() => setVisibleDialog(false)} title={title} description={subtitle} onConfirm={ConfirmDelete} />
            <FormModal isOpen={openModal} onClose={() => setOpenModal(false)} onSubmit={handleSubmit} title={type === 'create' ? 'Crear Categoría' : 'Editar Categoría'} mode={type} fields={fieldsCategory} />
            <DataTable value={categories?.data} tableStyle={{ minWidth: '50rem' }} header={header}>
                <Column field="id" header="id"></Column>
                <Column field="nombre" header="Name"></Column>
                <Column field="detalles" header="Category"></Column>
                <Column field="created_at" header="Quantity"></Column>
                <Column field="update_at" header="Quantity"></Column>
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