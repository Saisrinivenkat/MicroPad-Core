package com.getmicropad.NPXParser;

import org.simpleframework.xml.Attribute;
import org.simpleframework.xml.Element;
import org.simpleframework.xml.ElementList;

import java.util.ArrayList;
import java.util.List;

@Element
public class Section implements Parent {
	@ElementList(inline=true, type=Section.class, entry="section", required=false)
	public List<Section> sections;

	@ElementList(inline=true, type=Note.class, entry="note", required=false)
	public List<Note> notes;

	@Attribute
	private String title;

	public Section(String title) {
		this.title = title;
		this.sections = new ArrayList<>();
		this.notes = new ArrayList<>();
	}

	public Section(String title, List<Section> sections) {
		this.title = title;
		this.sections = sections;
		this.notes = new ArrayList<>();
	}

	public String getTitle() {
		return this.title;
	}

	public void setTitle(String title) {
		this.title = title;
	}
}
