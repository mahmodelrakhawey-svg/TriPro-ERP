-- TriPro ERP - Sync item_categories to menu_categories
-- Date: July 6, 2026
-- Description: Copies existing item_categories to menu_categories and sets up bidirectional triggers for real-time synchronization.

-- 1. Copy all existing categories from item_categories to menu_categories
INSERT INTO public.menu_categories (id, name, organization_id, display_order)
SELECT id, name, organization_id, display_order 
FROM public.item_categories
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order;

-- 2. Create the automatic sync trigger from item_categories to menu_categories
CREATE OR REPLACE FUNCTION public.fn_sync_item_to_menu_category()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.menu_categories (id, name, organization_id, display_order)
    VALUES (NEW.id, NEW.name, NEW.organization_id, NEW.display_order)
    ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        display_order = EXCLUDED.display_order
    WHERE (public.menu_categories.name IS DISTINCT FROM EXCLUDED.name OR 
           public.menu_categories.display_order IS DISTINCT FROM EXCLUDED.display_order);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_item_cat ON public.item_categories;
CREATE TRIGGER trg_sync_item_cat
AFTER INSERT OR UPDATE ON public.item_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_item_to_menu_category();

-- 3. Create the reverse sync trigger from menu_categories to item_categories
CREATE OR REPLACE FUNCTION public.fn_sync_menu_to_item_category()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.item_categories (id, name, organization_id, display_order)
    VALUES (NEW.id, NEW.name, NEW.organization_id, NEW.display_order)
    ON CONFLICT (id) DO UPDATE SET 
        name = EXCLUDED.name,
        display_order = EXCLUDED.display_order
    WHERE (public.item_categories.name IS DISTINCT FROM EXCLUDED.name OR 
           public.item_categories.display_order IS DISTINCT FROM EXCLUDED.display_order);
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_menu_cat ON public.menu_categories;
CREATE TRIGGER trg_sync_menu_cat
AFTER INSERT OR UPDATE ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_menu_to_item_category();

-- 4. Sync triggers for deletion to maintain integrity
CREATE OR REPLACE FUNCTION public.fn_sync_delete_item_category()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    DELETE FROM public.menu_categories WHERE id = OLD.id;
    RETURN OLD;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_delete_item_cat ON public.item_categories;
CREATE TRIGGER trg_sync_delete_item_cat
AFTER DELETE ON public.item_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_delete_item_category();

CREATE OR REPLACE FUNCTION public.fn_sync_delete_menu_category()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    DELETE FROM public.item_categories WHERE id = OLD.id;
    RETURN OLD;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_delete_menu_cat ON public.menu_categories;
CREATE TRIGGER trg_sync_delete_menu_cat
AFTER DELETE ON public.menu_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_delete_menu_category();
